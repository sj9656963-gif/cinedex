import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

/** 네이티브 <dialog> 기반 확인 창. [dialog 엘리먼트, confirm()] 을 돌려준다. */
export function useConfirm() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setOptions(next);
      }),
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (options && dialog && !dialog.open) dialog.showModal();
  }, [options]);

  useEffect(() => () => resolverRef.current?.(false), []);

  const close = (ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    dialogRef.current?.close();
    setOptions(null);
  };

  const element = (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        close(false);
      }}
    >
      {options && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            close(true);
          }}
        >
          <h2 id="confirm-title" className="dialog__title">
            {options.title}
          </h2>
          {options.message && <div className="dialog__message">{options.message}</div>}
          <div className="dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={() => close(false)} autoFocus>
              취소
            </button>
            <button type="submit" className={`btn ${options.danger ? 'btn--danger' : 'btn--primary'}`}>
              {options.confirmLabel ?? '확인'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );

  return [element, confirm] as const;
}
