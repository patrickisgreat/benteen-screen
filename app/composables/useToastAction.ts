/**
 * Wraps the repeated "toast on failure" handler pattern: runs an async action,
 * shows an error toast and returns false if it throws, or returns true on
 * success. The caller decides what success looks like (a message, a custom
 * color/icon, or a side effect like navigation), so success handling stays where
 * it actually varies between call sites.
 *
 *   if (await run(() => save(), 'Could not save')) toast.add({ title: 'Saved' })
 */
export function useToastAction() {
  const toast = useToast()

  async function run(action: () => Promise<void>, errorTitle: string): Promise<boolean> {
    try {
      await action()
      return true
    } catch {
      toast.add({ title: errorTitle, color: 'error' })
      return false
    }
  }

  return { run }
}
