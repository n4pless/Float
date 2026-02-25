import React from 'react';

/**
 * Card UI primitives matching drift-ui-template's shadcn/radix card system.
 */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => (
  <div
    className={`rounded-xl border border-white/10 bg-gray-900/80 shadow-lg backdrop-blur-sm ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader: React.FC<CardProps> = ({ children, className = '', ...props }) => (
  <div className={`px-4 py-3 border-b border-white/5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<CardProps & { as?: 'h2' | 'h3' | 'h4' }> = ({
  children,
  className = '',
  as: Tag = 'h3',
  ...props
}) => (
  <Tag className={`text-sm font-semibold text-white ${className}`} {...props}>
    {children}
  </Tag>
);

export const CardContent: React.FC<CardProps> = ({ children, className = '', ...props }) => (
  <div className={`p-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<CardProps> = ({ children, className = '', ...props }) => (
  <div className={`px-4 py-3 border-t border-white/5 ${className}`} {...props}>
    {children}
  </div>
);
