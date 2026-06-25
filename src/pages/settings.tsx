import { MainTitleBar } from "@/components/main-title-bar";
import { WindowFrame } from "@/components/window-frame";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SettingsPage(): React.ReactNode {
  return (
    <WindowFrame titleBar={<MainTitleBar />} contentClassName="p-6">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Automation providers, approvals, and rate limits land in later
            slices.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Linkgo is currently local-first with Campaigns enabled only.
        </CardContent>
      </Card>
    </WindowFrame>
  );
}
