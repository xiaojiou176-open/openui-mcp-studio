import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[140px] w-full rounded-[1.25rem] border border-input/85 bg-background/92 px-4 py-3 text-sm shadow-[0_0_0_1px_hsl(var(--border)/0.8),0_18px_38px_-28px_hsl(var(--shadow-color)/0.26)] transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none placeholder:text-muted-foreground/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
