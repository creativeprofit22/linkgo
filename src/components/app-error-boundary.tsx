import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

/**
 * Last-resort screen for a render crash. Without it React unmounts the whole
 * tree and the frameless window goes blank with no way to recover.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Linkgo crashed while drawing the screen", error, info);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        role="alert"
        className="bg-background text-foreground flex h-screen flex-col items-center justify-center gap-4 rounded-lg p-8 text-center"
      >
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Linkgo hit a problem drawing this screen. Anything already saved is
          kept. Reload to keep going.
        </p>
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload
        </Button>
      </main>
    );
  }
}
