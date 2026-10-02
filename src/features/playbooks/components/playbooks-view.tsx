import { AlertCircle, NotebookTabs } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlaybookCard } from "@/features/playbooks/components/playbook-card";
import { usePlaybooks } from "@/features/playbooks/hooks/use-playbooks";

export function PlaybooksView(): React.ReactNode {
  const { playbooks, loading, saving, error, loadPlaybooks, updateOverride } =
    usePlaybooks();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <NotebookTabs className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Brand voice
              </h2>
              <p className="text-muted-foreground text-sm">
                Writing guides that shape how the AI writes for you.
              </p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadPlaybooks()}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-destructive size-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadPlaybooks()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading brand voice guides…
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-card/70">
            <CardContent className="text-muted-foreground p-4 text-sm">
              These guides only shape how the AI writes and the tips you see.
              They never let Linkgo copy data from other sites, post or comment
              on its own, control your browser, or send your data anywhere.
            </CardContent>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            {playbooks.map((playbook) => (
              <PlaybookCard
                key={playbook.key}
                playbook={playbook}
                saving={saving}
                onUpdate={updateOverride}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
