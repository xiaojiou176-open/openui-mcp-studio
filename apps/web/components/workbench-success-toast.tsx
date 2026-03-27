"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type WorkbenchSuccessToastProps = {
	message: string;
	onDismiss: () => void;
	open: boolean;
};

export function WorkbenchSuccessToast({
	message,
	onDismiss,
	open,
}: WorkbenchSuccessToastProps) {
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	if (!isMounted) {
		return null;
	}

	return createPortal(
		<div
			className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex justify-center sm:inset-x-auto sm:right-4 sm:top-4 sm:justify-end"
			aria-live="polite"
		>
			{open ? (
				<div
					className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success-soft-foreground shadow-2xl"
					data-testid="success-state"
				>
					<CheckCircle2
						className="mt-0.5 h-4 w-4 text-success-soft-foreground"
						aria-hidden="true"
					/>
					<div className="flex-1 space-y-1">
						<p className="font-medium text-success-soft-foreground">Success</p>
						<p className="text-success-soft-foreground">{message}</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-8 w-8 shrink-0 text-success-soft-foreground/80 hover:bg-success/15 hover:text-success-soft-foreground"
						aria-label="Dismiss success message"
						data-testid="dismiss-success"
						onClick={onDismiss}
					>
						<X className="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			) : null}
		</div>,
		document.body,
	);
}
