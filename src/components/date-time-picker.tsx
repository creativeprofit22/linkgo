import { CalendarDays } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { TZDate } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  describeTimeZone,
  formatWallClockDate,
  formatWallClockTime,
  isKnownTimeZone,
  isLocalTimeZone,
  joinWallClock,
  parseWallClock,
} from "@/lib/date-time/wall-clock";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  /** Wall-clock `YYYY-MM-DDTHH:mm`, or "" when not picked yet. */
  value: string;
  /** IANA zone or "local" (the device zone). */
  timezone: string;
  /** Called with `YYYY-MM-DDTHH:mm` once both parts are set, else "". */
  onChange: (value: string) => void;
  /** Id of the date button; the time field uses `${id}-time`. */
  id: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function splitValue(value: string): { date: string; time: string } {
  const parts = parseWallClock(value);
  if (parts === null) return { date: "", time: "" };
  return { date: formatWallClockDate(parts), time: formatWallClockTime(parts) };
}

function parseDate(date: string): DateParts | null {
  const parts = parseWallClock(joinWallClock(date, "00:00"));
  return parts === null
    ? null
    : { year: parts.year, month: parts.month, day: parts.day };
}

/** Calendar zone: undefined means the device zone (or an unknown zone). */
function pickerZone(timezone: string): string | undefined {
  if (isLocalTimeZone(timezone) || !isKnownTimeZone(timezone)) return undefined;
  return timezone.trim();
}

/** Noon on that calendar day in the zone, so no day boundary is crossed. */
function toPickerDate(parts: DateParts, zone: string | undefined): Date {
  return zone === undefined
    ? new Date(parts.year, parts.month - 1, parts.day, 12)
    : new TZDate(parts.year, parts.month - 1, parts.day, 12, zone);
}

function formatDateLabel(parts: DateParts): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

/**
 * Accessible date and time picker. The date comes from a keyboard-navigable
 * month grid in a popover; the time from a native time field. Values stay
 * wall-clock strings in the slot's own time zone, so nothing shifts.
 */
export function DateTimePicker({
  value,
  timezone,
  onChange,
  id,
  label = "Date and time",
  disabled = false,
  className,
}: DateTimePickerProps): ReactNode {
  const [draft, setDraft] = useState(() => splitValue(value));
  const [open, setOpen] = useState(false);
  const zoneNoteId = useId();
  const legendId = useId();

  // Follow outside changes (e.g. a prefilled post) without losing a half-set draft.
  useEffect(() => {
    if (value === "") return;
    setDraft(splitValue(value));
  }, [value]);

  const update = (next: { date: string; time: string }): void => {
    setDraft(next);
    onChange(
      next.date !== "" && next.time !== ""
        ? joinWallClock(next.date, next.time)
        : "",
    );
  };

  const zone = pickerZone(timezone);
  const dateParts = parseDate(draft.date);
  const selected =
    dateParts === null ? undefined : toPickerDate(dateParts, zone);
  const zoneLabel = describeTimeZone(timezone);
  const unknownZone = !isKnownTimeZone(timezone);

  return (
    <fieldset
      className={cn("grid gap-2", className)}
      aria-describedby={zoneNoteId}
      disabled={disabled}
    >
      <legend id={legendId} className="mb-2 text-sm font-medium">
        {label}
      </legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="grid gap-1">
          <Label htmlFor={id} className="text-muted-foreground text-xs">
            Date
          </Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id={id}
                type="button"
                variant="outline"
                aria-haspopup="dialog"
                className={cn(
                  "w-full justify-start font-normal",
                  dateParts === null && "text-muted-foreground",
                )}
              >
                <CalendarDays aria-hidden="true" />
                {dateParts === null
                  ? "Pick a date"
                  : formatDateLabel(dateParts)}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              aria-label="Choose a date"
              // Let the grid focus the chosen day (or today) so arrow keys
              // work at once; Radix would otherwise focus the month button.
              onOpenAutoFocus={(event) => {
                const content = event.currentTarget;
                if (!(content instanceof HTMLElement)) return;
                const day =
                  content.querySelector<HTMLButtonElement>(
                    "td[data-selected] button",
                  ) ??
                  content.querySelector<HTMLButtonElement>(
                    "td[data-today] button",
                  ) ??
                  content.querySelector<HTMLButtonElement>(
                    "td[data-day]:not([data-outside]) button",
                  );
                if (day === null) return;
                event.preventDefault();
                day.focus();
              }}
            >
              <Calendar
                mode="single"
                autoFocus
                timeZone={zone}
                selected={selected}
                {...(selected === undefined ? {} : { defaultMonth: selected })}
                onSelect={(date) => {
                  if (date === undefined) return;
                  update({
                    date: formatWallClockDate({
                      year: date.getFullYear(),
                      month: date.getMonth() + 1,
                      day: date.getDate(),
                    }),
                    time: draft.time === "" ? "09:00" : draft.time,
                  });
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid gap-1">
          <Label
            htmlFor={`${id}-time`}
            className="text-muted-foreground text-xs"
          >
            Time
          </Label>
          <Input
            id={`${id}-time`}
            type="time"
            required
            value={draft.time}
            onChange={(event) =>
              update({ date: draft.date, time: event.target.value })
            }
          />
        </div>
      </div>
      <p id={zoneNoteId} className="text-muted-foreground text-xs">
        {unknownZone
          ? `Times are in ${zoneLabel}. This computer doesn't recognise that time zone, so check the date carefully.`
          : `Times are in ${zoneLabel}.`}
      </p>
    </fieldset>
  );
}
