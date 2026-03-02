#!/usr/bin/env python3
"""Fix protocol-v2/Cargo.toml release profile for BPF stack safety."""
import os

path = os.path.expanduser("~/Drift-Clone/protocol-v2/Cargo.toml")

new_content = """[workspace]
members = [
\t"programs/*",
]
exclude = [
\t"deps/serum-dex"
]
resolver = "2"

[profile.release]
opt-level = "z"
lto = "fat"
codegen-units = 1
overflow-checks = false

[profile.release.build-override]
opt-level = 3
incremental = false
codegen-units = 1
"""

with open(path, "w") as f:
    f.write(new_content)

print("Cargo.toml updated:")
print(new_content)
