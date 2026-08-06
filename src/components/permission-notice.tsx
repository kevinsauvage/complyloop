export function PermissionNotice({ children }: { children: string }) {
  return (
    <p className="text-sm text-zinc-600" role="status">
      {children}
    </p>
  );
}
