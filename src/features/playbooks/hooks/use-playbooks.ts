import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listPlaybooks,
  updatePlaybookOverride,
} from "@/features/playbooks/data";
import type {
  AgentPlaybookView,
  UpdatePlaybookOverrideInput,
} from "@/features/playbooks/types";

interface UsePlaybooksState {
  playbooks: AgentPlaybookView[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  loadPlaybooks: () => Promise<void>;
  updateOverride: (input: UpdatePlaybookOverrideInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected playbook error";
}

export function usePlaybooks(): UsePlaybooksState {
  const [playbooks, setPlaybooks] = useState<AgentPlaybookView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlaybooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlaybooks(await listPlaybooks());
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlaybooks();
  }, [loadPlaybooks]);

  const updateOverride = useCallback(
    async (input: UpdatePlaybookOverrideInput) => {
      setSaving(true);
      try {
        await updatePlaybookOverride(input);
        setPlaybooks(await listPlaybooks());
        toast.success("Playbook saved");
      } catch (caught) {
        toast.error("Playbook was not saved", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return useMemo(
    () => ({
      playbooks,
      loading,
      saving,
      error,
      loadPlaybooks,
      updateOverride,
    }),
    [playbooks, loading, saving, error, loadPlaybooks, updateOverride],
  );
}
