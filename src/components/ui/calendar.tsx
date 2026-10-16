import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DayPicker,
  getDefaultClassNames,
  type ChevronProps,
} from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CalendarChevron({
  orientation,
  className,
}: ChevronProps): React.JSX.Element {
  const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
  return <Icon aria-hidden="true" className={cn("size-4", className)} />;
}

/** Accessible month grid (react-day-picker) styled with app tokens. */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>): React.ReactNode {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("text-sm", className)}
      classNames={{
        root: cn(defaults.root, "w-fit"),
        months: "relative flex flex-col gap-4",
        month: "flex flex-col gap-3",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "aria-disabled:opacity-50",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "aria-disabled:opacity-50",
        ),
        month_caption: "flex h-8 items-center justify-center px-10",
        caption_label: "text-sm font-medium",
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground w-9 text-center text-xs font-normal select-none",
        week: "mt-1 flex",
        day: "relative size-9 p-0 text-center",
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "font-normal aria-selected:opacity-100",
        ),
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground forced-colors:[&>button]:border-2",
        today: "[&>button]:border [&>button]:border-ring",
        outside: "text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        focused: "",
        ...classNames,
      }}
      components={{ Chevron: CalendarChevron, ...components }}
      {...props}
    />
  );
}

export { Calendar };
