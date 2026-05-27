import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[0.95rem] border text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[0_18px_44px_-22px_hsl(var(--primary)/0.68)] hover:bg-primary/94",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[0_18px_44px_-22px_hsl(var(--destructive)/0.65)] hover:bg-destructive/92",
        outline:
          "border-border/80 bg-background/92 text-foreground shadow-[0_0_0_1px_hsl(var(--border)/0.8),0_14px_34px_-24px_hsl(var(--shadow-color)/0.3)] hover:border-foreground/15 hover:bg-accent hover:text-accent-foreground",
        secondary:
          "border-border/70 bg-secondary/92 text-secondary-foreground shadow-[0_12px_28px_-24px_hsl(var(--shadow-color)/0.25)] hover:bg-secondary/80",
        ghost:
          "border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-accent hover:text-foreground",
        link:
          "border-transparent bg-transparent px-0 text-primary underline-offset-4 shadow-none hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-10 rounded-full px-4 text-sm",
        lg: "h-12 rounded-full px-6 text-sm",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
    compoundVariants: [
      {
        variant: "link",
        size: "default",
        className: "h-auto p-0",
      },
    ],
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
