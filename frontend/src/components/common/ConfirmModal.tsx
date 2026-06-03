/**
 * ConfirmModal — Confirmation dialog for destructive/cloud actions.
 * For extra-dangerous actions, requires typing the action name.
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
  /** If set, user must type this text to confirm */
  requireTyped?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  requireTyped,
  onConfirm,
  loading = false,
}: ConfirmModalProps) {
  const [typedValue, setTypedValue] = useState('');
  const isTypedValid = !requireTyped || typedValue === requireTyped;

  const handleConfirm = async () => {
    await onConfirm();
    setTypedValue('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant === 'destructive' && (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requireTyped && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{requireTyped}</span> to
              confirm:
            </p>
            <Input
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={requireTyped}
              aria-label="Confirmation text"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={!isTypedValid || loading}
          >
            {loading ? 'Processing…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
