import { forwardRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './ui';

interface DockMenuProps {
  anchor: DOMRect;
  children: ReactNode;
  className?: string;
}

export const DockMenu = forwardRef<HTMLDivElement, DockMenuProps>(function DockMenu({ anchor, children, className }, ref) {
  const bottom = window.innerHeight - anchor.top + 12;
  const centerX = anchor.left + anchor.width / 2;

  return createPortal(
    <div
      ref={ref}
      className={cx('fixed z-[80] animate-pop-in rounded-[24px] bg-popover shadow-2xl ring-1 ring-line', className)}
      style={{ bottom, left: centerX, transform: 'translateX(-50%)' }}
    >
      {children}
    </div>,
    document.body,
  );
});
