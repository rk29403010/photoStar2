import React, { forwardRef } from 'react';

export type ButtonProps = {
    readonly variant?: 'primary' | 'secondary' | 'danger';
} & React.ButtonHTMLAttributes<HTMLButtonElement>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
    variant = 'primary',
    className = '',
    children,
    ...props
}, ref) => {
    const baseClass = 'px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
    
    let variantClass = '';
    if (variant === 'primary') {
        variantClass = 'bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-accent';
    } else if (variant === 'secondary') {
        variantClass = 'bg-surface-secondary text-content border border-content/10 hover:bg-surface';
    } else if (variant === 'danger') {
        variantClass = 'bg-red-600/10 text-red-400 border border-red-600/20 hover:bg-red-600/20';
    }

    return (
        <button
            ref={ref}
            className={`${baseClass} ${variantClass} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
});

Button.displayName = 'Button';

export type IconButtonProps = {
    readonly active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
    className = '',
    active = false,
    children,
    ...props
}, ref) => {
    const baseClass = 'p-2 text-sm rounded-lg transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50';
    const activeClass = active 
        ? 'bg-brand-accent/20 text-brand-accent border border-brand-accent/40' 
        : 'bg-transparent text-content-secondary hover:text-content hover:bg-surface-secondary border border-transparent';

    return (
        <button
            ref={ref}
            className={`${baseClass} ${activeClass} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
});

IconButton.displayName = 'IconButton';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({
    className = '',
    type = 'text',
    ...props
}, ref) => {
    return (
        <input
            ref={ref}
            type={type}
            className={`w-full bg-surface-secondary text-content border border-content/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-accent motion-safe:transition-all ${className}`}
            {...props}
        />
    );
});

Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({
    className = '',
    children,
    ...props
}, ref) => {
    return (
        <select
            ref={ref}
            className={`w-full bg-surface-secondary text-content border border-content/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-accent cursor-pointer motion-safe:transition-all ${className}`}
            {...props}
        >
            {children}
        </select>
    );
});

Select.displayName = 'Select';

export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({
    className = '',
    ...props
}, ref) => {
    return (
        <input
            ref={ref}
            type="checkbox"
            className={`w-4 h-4 rounded border-content/20 bg-surface-secondary text-brand-accent focus:ring-brand-accent cursor-pointer ${className}`}
            {...props}
        />
    );
});

Checkbox.displayName = 'Checkbox';

export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({
    className = '',
    children,
    ...props
}, ref) => {
    return (
        <div
            ref={ref}
            className={`p-4 rounded-xl border border-content/10 bg-surface/50 backdrop-blur-xs flex flex-col gap-3 shadow-md ${className}`}
            {...props}
        >
            {children}
        </div>
    );
});

Card.displayName = 'Card';

export const Panel = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({
    className = '',
    children,
    ...props
}, ref) => {
    return (
        <div
            ref={ref}
            className={`flex flex-col h-full bg-gradient-to-b from-surface to-surface-secondary border-l border-content/10 overflow-hidden ${className}`}
            {...props}
        >
            {children}
        </div>
    );
});

Panel.displayName = 'Panel';

export const Header = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({
    className = '',
    children,
    ...props
}, ref) => {
    return (
        <div
            ref={ref}
            className={`py-3 px-4 border-b border-content/10 bg-surface/90 flex items-center justify-between gap-3 ${className}`}
            {...props}
        >
            {children}
        </div>
    );
});

Header.displayName = 'Header';
