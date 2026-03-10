use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("FWaSUVUSBk7MoYbWL8DLWkbfLHgbMcmGfYLgVQ5foaLf");

/// SOL Prediction Market — PancakeSwap-style on-chain program.
///
/// Users bet SOL on whether the oracle price goes UP or DOWN over a fixed
/// interval. Winners split the losing pool (minus a treasury fee).
///
/// Flow:  genesis_start → genesis_lock → execute_round (repeating)
/// Users: bet_bull / bet_bear → claim
#[program]
pub mod prediction {
    use super::*;

    /* ──────────── Admin ──────────── */

    /// Create the global game config PDA (one-time).
    pub fn initialize(
        ctx: Context<Initialize>,
        interval_seconds: u32,
        min_bet_amount: u64,
        treasury_fee: u32,
    ) -> Result<()> {
        require!(treasury_fee <= 1000, PredError::InvalidFee);
        require!(interval_seconds >= 10, PredError::InvalidInterval);
        require!(min_bet_amount >= 1_000_000, PredError::BetTooSmall); // >= 0.001 SOL

        let g = &mut ctx.accounts.game;
        g.admin = ctx.accounts.admin.key();
        g.operator = ctx.accounts.admin.key();
        g.treasury = ctx.accounts.treasury.key();
        g.current_epoch = 0;
        g.interval_seconds = interval_seconds;
        g.min_bet_amount = min_bet_amount;
        g.treasury_fee = treasury_fee;
        g.genesis_start_once = false;
        g.genesis_lock_once = false;
        g.paused = false;
        g.bump = ctx.bumps.game;
        Ok(())
    }

    /// Set the keeper-bot operator key.
    pub fn set_operator(ctx: Context<AdminOnly>, new_operator: Pubkey) -> Result<()> {
        ctx.accounts.game.operator = new_operator;
        Ok(())
    }

    pub fn pause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.game.paused = true;
        Ok(())
    }

    pub fn unpause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.game.paused = false;
        Ok(())
    }

    /// Change the treasury fee-collection wallet.
    pub fn set_treasury(ctx: Context<AdminOnly>, new_treasury: Pubkey) -> Result<()> {
        ctx.accounts.game.treasury = new_treasury;
        Ok(())
    }

    /* ──────────── Genesis (first two calls only) ──────────── */

    /// Operator: create the very first round (epoch 1).
    pub fn genesis_start_round(ctx: Context<GenesisStartRound>) -> Result<()> {
        let g = &mut ctx.accounts.game;
        require!(!g.genesis_start_once, PredError::GenesisAlreadyStarted);
        require!(!g.paused, PredError::Paused);

        g.current_epoch = 1;
        g.genesis_start_once = true;

        let ts = Clock::get()?.unix_timestamp;
        let r = &mut ctx.accounts.round;
        r.epoch = 1;
        r.start_timestamp = ts;
        r.lock_timestamp = ts + g.interval_seconds as i64;
        r.bump = ctx.bumps.round;

        emit!(StartRoundEvent { epoch: 1, timestamp: ts });
        Ok(())
    }

    /// Operator: lock round 1 and create round 2.
    pub fn genesis_lock_round(ctx: Context<GenesisLockRound>, price: i64) -> Result<()> {
        let g = &mut ctx.accounts.game;
        require!(g.genesis_start_once, PredError::GenesisNotStarted);
        require!(!g.genesis_lock_once, PredError::GenesisAlreadyLocked);
        require!(!g.paused, PredError::Paused);
        require!(price > 0, PredError::InvalidPrice);

        let ts = Clock::get()?.unix_timestamp;
        let iv = g.interval_seconds as i64;

        // Security: don't lock before the lock timestamp
        require!(
            ts >= ctx.accounts.current_round.lock_timestamp,
            PredError::RoundNotLockable,
        );

        // Lock round 1
        let r1 = &mut ctx.accounts.current_round;
        r1.lock_price = price;
        r1.lock_timestamp = ts;
        r1.close_timestamp = ts + iv;

        // Create round 2
        g.current_epoch = 2;
        g.genesis_lock_once = true;

        let r2 = &mut ctx.accounts.next_round;
        r2.epoch = 2;
        r2.start_timestamp = ts;
        r2.lock_timestamp = ts + iv;
        r2.bump = ctx.bumps.next_round;

        emit!(LockRoundEvent { epoch: 1, price, timestamp: ts });
        emit!(StartRoundEvent { epoch: 2, timestamp: ts });
        Ok(())
    }

    /* ──────────── Recurring: execute_round ──────────── */

    /// Operator: close round N, lock round N+1, create round N+2.
    pub fn execute_round(ctx: Context<ExecuteRound>, close_epoch: u64, price: i64) -> Result<()> {
        // Read game fields first (immutable borrows released immediately)
        require!(
            ctx.accounts.game.genesis_start_once && ctx.accounts.game.genesis_lock_once,
            PredError::GenesisNotComplete
        );
        require!(!ctx.accounts.game.paused, PredError::Paused);
        require!(price > 0, PredError::InvalidPrice);
        require!(close_epoch + 1 == ctx.accounts.game.current_epoch, PredError::InvalidEpoch);

        let ts = Clock::get()?.unix_timestamp;
        let iv = ctx.accounts.game.interval_seconds as i64;
        let treasury_fee = ctx.accounts.game.treasury_fee;

        // ── Security: operator cannot close a round before its close_timestamp ──
        require!(
            ts >= ctx.accounts.closing_round.close_timestamp,
            PredError::RoundNotClosable,
        );

        // Grab AccountInfo clones BEFORE mutable borrows (for lamport manipulation)
        let game_ai = ctx.accounts.game.to_account_info();
        let treasury_ai = ctx.accounts.treasury.to_account_info();

        // ── 1. Close the expiring round ──
        let c = &mut ctx.accounts.closing_round;
        require!(!c.oracle_called, PredError::RoundAlreadyClosed);

        c.close_price = price;
        c.close_timestamp = ts;
        c.oracle_called = true;

        // rewards
        let total = c.total_amount;
        let refund = c.lock_price == price || c.bull_amount == 0 || c.bear_amount == 0;

        if total > 0 && !refund {
            let fee = (total as u128 * treasury_fee as u128 / 10000) as u64;
            c.treasury_amount = fee;
            c.reward_amount = total.checked_sub(fee).unwrap();

            if fee > 0 {
                **game_ai.try_borrow_mut_lamports()? = game_ai
                    .lamports()
                    .checked_sub(fee)
                    .ok_or(error!(PredError::InsufficientFunds))?;
                **treasury_ai.try_borrow_mut_lamports()? = treasury_ai
                    .lamports()
                    .checked_add(fee)
                    .ok_or(error!(PredError::Overflow))?;
            }
        } else {
            c.reward_amount = total;
            c.treasury_amount = 0;
        }

        // ── 2. Lock the current bettable round ──
        let cur = &mut ctx.accounts.current_round;
        cur.lock_price = price;
        cur.lock_timestamp = ts;
        cur.close_timestamp = ts + iv;

        // ── 3. Create the next round ──
        let new_epoch = close_epoch + 2;
        ctx.accounts.game.current_epoch = new_epoch;

        let nxt = &mut ctx.accounts.next_round;
        nxt.epoch = new_epoch;
        nxt.start_timestamp = ts;
        nxt.lock_timestamp = ts + iv;
        nxt.bump = ctx.bumps.next_round;

        emit!(EndRoundEvent { epoch: close_epoch, price, timestamp: ts });
        emit!(LockRoundEvent { epoch: close_epoch + 1, price, timestamp: ts });
        emit!(StartRoundEvent { epoch: new_epoch, timestamp: ts });
        Ok(())
    }

    /* ──────────── Operator: reclaim rent from old rounds ──── */

    /// Close an expired round PDA to reclaim its rent.
    /// Requires: oracle_called = true AND at least 1 hour after close_timestamp.
    /// The keeper should wait 48h+ before calling this to give users time to claim.
    pub fn close_round(ctx: Context<CloseRound>, _epoch: u64) -> Result<()> {
        let round = &ctx.accounts.round;
        require!(round.oracle_called, PredError::RoundNotClosed);

        let ts = Clock::get()?.unix_timestamp;
        // Minimum 48 hours after close to give users time to claim.
        // The keeper's CLOSE_GRACE env var controls the off-chain delay (>= 48h).
        require!(
            ts > round.close_timestamp + 172_800, // 48 * 3600 = 172,800 seconds
            PredError::RoundNotClosable,
        );

        // Anchor's `close = operator` handles draining lamports + zeroing the account.
        Ok(())
    }

    /* ──────────── User: bet & claim ──────────── */

    /// Bet UP (bull).
    pub fn bet_bull(ctx: Context<PlaceBet>, epoch: u64, amount: u64) -> Result<()> {
        _place_bet(ctx, epoch, amount, 0)
    }

    /// Bet DOWN (bear).
    pub fn bet_bear(ctx: Context<PlaceBet>, epoch: u64, amount: u64) -> Result<()> {
        _place_bet(ctx, epoch, amount, 1)
    }

    /// Add more SOL to an existing position (same direction only).
    pub fn add_position(ctx: Context<AddPosition>, epoch: u64, amount: u64) -> Result<()> {
        _add_position(ctx, epoch, amount)
    }

    /// Claim winnings (or refund) from a closed round.
    pub fn claim(ctx: Context<Claim>, epoch: u64) -> Result<()> {
        let round = &ctx.accounts.round;
        let bet = &mut ctx.accounts.user_bet;

        require!(round.oracle_called, PredError::RoundNotClosed);
        require!(!bet.claimed, PredError::AlreadyClaimed);
        require!(bet.round_epoch == epoch, PredError::InvalidEpoch);

        let refund = round.lock_price == round.close_price
            || round.bull_amount == 0
            || round.bear_amount == 0;

        let payout = if refund {
            bet.amount
        } else {
            let bulls_win = round.close_price > round.lock_price;
            let user_bull = bet.position == 0;

            if bulls_win != user_bull {
                0
            } else {
                let win_total = if bulls_win {
                    round.bull_amount
                } else {
                    round.bear_amount
                };
                ((bet.amount as u128)
                    .checked_mul(round.reward_amount as u128)
                    .ok_or(error!(PredError::Overflow))?
                    .checked_div(win_total as u128)
                    .ok_or(error!(PredError::Overflow))?) as u64
            }
        };

        require!(payout > 0, PredError::NotWinner);

        // Transfer SOL from game vault → user
        let gi = ctx.accounts.game.to_account_info();
        let ui = ctx.accounts.user.to_account_info();
        **gi.try_borrow_mut_lamports()? = gi
            .lamports()
            .checked_sub(payout)
            .ok_or(error!(PredError::InsufficientFunds))?;
        **ui.try_borrow_mut_lamports()? = ui
            .lamports()
            .checked_add(payout)
            .ok_or(error!(PredError::Overflow))?;

        bet.claimed = true;

        emit!(ClaimEvent {
            user: bet.user,
            epoch,
            amount: payout,
        });
        Ok(())
    }
}

/* ═══════════════════════════════════════════════════
   Helper
   ═══════════════════════════════════════════════════ */

fn _add_position(ctx: Context<AddPosition>, epoch: u64, amount: u64) -> Result<()> {
    let g = &ctx.accounts.game;
    require!(!g.paused, PredError::Paused);
    require!(amount >= g.min_bet_amount, PredError::BetTooSmall);

    let round = &mut ctx.accounts.round;
    require!(round.epoch == epoch, PredError::InvalidEpoch);

    let ts = Clock::get()?.unix_timestamp;
    require!(ts < round.lock_timestamp, PredError::BettingClosed);

    // Transfer SOL from user → game vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.game.to_account_info(),
            },
        ),
        amount,
    )?;

    round.total_amount = round
        .total_amount
        .checked_add(amount)
        .ok_or(error!(PredError::Overflow))?;

    let position = ctx.accounts.user_bet.position;
    if position == 0 {
        round.bull_amount = round
            .bull_amount
            .checked_add(amount)
            .ok_or(error!(PredError::Overflow))?;
    } else {
        round.bear_amount = round
            .bear_amount
            .checked_add(amount)
            .ok_or(error!(PredError::Overflow))?;
    }

    let b = &mut ctx.accounts.user_bet;
    b.amount = b.amount.checked_add(amount).ok_or(error!(PredError::Overflow))?;

    emit!(BetEvent {
        user: ctx.accounts.user.key(),
        epoch,
        amount,
        position,
    });
    Ok(())
}

fn _place_bet(ctx: Context<PlaceBet>, epoch: u64, amount: u64, position: u8) -> Result<()> {
    let g = &ctx.accounts.game;
    require!(!g.paused, PredError::Paused);
    require!(amount >= g.min_bet_amount, PredError::BetTooSmall);

    let round = &mut ctx.accounts.round;
    require!(round.epoch == epoch, PredError::InvalidEpoch);

    let ts = Clock::get()?.unix_timestamp;
    require!(ts < round.lock_timestamp, PredError::BettingClosed);

    // Transfer SOL from user → game vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.game.to_account_info(),
            },
        ),
        amount,
    )?;

    round.total_amount = round
        .total_amount
        .checked_add(amount)
        .ok_or(error!(PredError::Overflow))?;
    if position == 0 {
        round.bull_amount = round
            .bull_amount
            .checked_add(amount)
            .ok_or(error!(PredError::Overflow))?;
    } else {
        round.bear_amount = round
            .bear_amount
            .checked_add(amount)
            .ok_or(error!(PredError::Overflow))?;
    }

    let b = &mut ctx.accounts.user_bet;
    b.user = ctx.accounts.user.key();
    b.round_epoch = epoch;
    b.amount = amount;
    b.position = position;
    b.claimed = false;
    b.bump = ctx.bumps.user_bet;

    emit!(BetEvent {
        user: ctx.accounts.user.key(),
        epoch,
        amount,
        position,
    });
    Ok(())
}

/* ═══════════════════════════════════════════════════
   Account Contexts
   ═══════════════════════════════════════════════════ */

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + Game::INIT_SPACE, seeds = [b"game"], bump)]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Treasury wallet — any valid address.
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"game"], bump = game.bump, has_one = admin)]
    pub game: Account<'info, Game>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct GenesisStartRound<'info> {
    #[account(mut, seeds = [b"game"], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(
        init, payer = operator,
        space = 8 + Round::INIT_SPACE,
        seeds = [b"round", 1u64.to_le_bytes().as_ref()],
        bump,
    )]
    pub round: Account<'info, Round>,
    #[account(mut, constraint = operator.key() == game.operator @ PredError::NotOperator)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GenesisLockRound<'info> {
    #[account(mut, seeds = [b"game"], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(mut, seeds = [b"round", 1u64.to_le_bytes().as_ref()], bump = current_round.bump)]
    pub current_round: Account<'info, Round>,
    #[account(
        init, payer = operator,
        space = 8 + Round::INIT_SPACE,
        seeds = [b"round", 2u64.to_le_bytes().as_ref()],
        bump,
    )]
    pub next_round: Account<'info, Round>,
    #[account(mut, constraint = operator.key() == game.operator @ PredError::NotOperator)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(close_epoch: u64)]
pub struct ExecuteRound<'info> {
    #[account(mut, seeds = [b"game"], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(mut, seeds = [b"round", close_epoch.to_le_bytes().as_ref()], bump = closing_round.bump)]
    pub closing_round: Account<'info, Round>,
    #[account(mut, seeds = [b"round", (close_epoch + 1).to_le_bytes().as_ref()], bump = current_round.bump)]
    pub current_round: Account<'info, Round>,
    #[account(
        init, payer = operator,
        space = 8 + Round::INIT_SPACE,
        seeds = [b"round", (close_epoch + 2).to_le_bytes().as_ref()],
        bump,
    )]
    pub next_round: Account<'info, Round>,
    /// CHECK: Treasury receives fees.
    #[account(mut, constraint = treasury.key() == game.treasury @ PredError::InvalidTreasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(mut, constraint = operator.key() == game.operator @ PredError::NotOperator)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct CloseRound<'info> {
    #[account(seeds = [b"game"], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(
        mut,
        close = operator,
        seeds = [b"round", epoch.to_le_bytes().as_ref()],
        bump = round.bump,
    )]
    pub round: Account<'info, Round>,
    #[account(mut, constraint = operator.key() == game.operator @ PredError::NotOperator)]
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct PlaceBet<'info> {
    #[account(mut, seeds = [b"game"], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(mut, seeds = [b"round", epoch.to_le_bytes().as_ref()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(
        init, payer = user,
        space = 8 + UserBet::INIT_SPACE,
        seeds = [b"bet", epoch.to_le_bytes().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct AddPosition<'info> {
    #[account(mut, seeds = [b"game"], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(mut, seeds = [b"round", epoch.to_le_bytes().as_ref()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(
        mut,
        seeds = [b"bet", epoch.to_le_bytes().as_ref(), user.key().as_ref()],
        bump = user_bet.bump,
        has_one = user,
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct Claim<'info> {
    #[account(mut, seeds = [b"game"], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(seeds = [b"round", epoch.to_le_bytes().as_ref()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(mut, seeds = [b"bet", epoch.to_le_bytes().as_ref(), user.key().as_ref()], bump = user_bet.bump, has_one = user)]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub user: Signer<'info>,
}

/* ═══════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════ */

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub admin: Pubkey,           // 32
    pub operator: Pubkey,        // 32
    pub treasury: Pubkey,        // 32
    pub current_epoch: u64,      // 8
    pub interval_seconds: u32,   // 4
    pub min_bet_amount: u64,     // 8
    pub treasury_fee: u32,       // 4  (basis points, max 1000 = 10%)
    pub genesis_start_once: bool,// 1
    pub genesis_lock_once: bool, // 1
    pub paused: bool,            // 1
    pub bump: u8,                // 1
}

#[account]
#[derive(InitSpace)]
pub struct Round {
    pub epoch: u64,
    pub start_timestamp: i64,
    pub lock_timestamp: i64,
    pub close_timestamp: i64,
    pub lock_price: i64,         // price × 10^6
    pub close_price: i64,
    pub total_amount: u64,       // lamports
    pub bull_amount: u64,
    pub bear_amount: u64,
    pub reward_amount: u64,
    pub treasury_amount: u64,
    pub oracle_called: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserBet {
    pub user: Pubkey,
    pub round_epoch: u64,
    pub amount: u64,
    pub position: u8,   // 0 = Bull (UP), 1 = Bear (DOWN)
    pub claimed: bool,
    pub bump: u8,
}

/* ═══════════════════════════════════════════════════
   Events
   ═══════════════════════════════════════════════════ */

#[event]
pub struct StartRoundEvent {
    pub epoch: u64,
    pub timestamp: i64,
}

#[event]
pub struct LockRoundEvent {
    pub epoch: u64,
    pub price: i64,
    pub timestamp: i64,
}

#[event]
pub struct EndRoundEvent {
    pub epoch: u64,
    pub price: i64,
    pub timestamp: i64,
}

#[event]
pub struct BetEvent {
    pub user: Pubkey,
    pub epoch: u64,
    pub amount: u64,
    pub position: u8,
}

#[event]
pub struct ClaimEvent {
    pub user: Pubkey,
    pub epoch: u64,
    pub amount: u64,
}

/* ═══════════════════════════════════════════════════
   Errors
   ═══════════════════════════════════════════════════ */

#[error_code]
pub enum PredError {
    #[msg("Fee exceeds 10 %")]
    InvalidFee,
    #[msg("Interval too short")]
    InvalidInterval,
    #[msg("Genesis already started")]
    GenesisAlreadyStarted,
    #[msg("Must start genesis first")]
    GenesisNotStarted,
    #[msg("Genesis already locked")]
    GenesisAlreadyLocked,
    #[msg("Genesis not fully initialized")]
    GenesisNotComplete,
    #[msg("Round not lockable yet")]
    RoundNotLockable,
    #[msg("Round not closable yet")]
    RoundNotClosable,
    #[msg("Round already closed")]
    RoundAlreadyClosed,
    #[msg("Round not yet closed")]
    RoundNotClosed,
    #[msg("Invalid epoch")]
    InvalidEpoch,
    #[msg("Price must be positive")]
    InvalidPrice,
    #[msg("Betting closed")]
    BettingClosed,
    #[msg("Bet below minimum")]
    BetTooSmall,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Nothing to claim")]
    NotWinner,
    #[msg("Vault insufficient")]
    InsufficientFunds,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Not operator")]
    NotOperator,
    #[msg("Wrong treasury")]
    InvalidTreasury,
    #[msg("Paused")]
    Paused,
}
