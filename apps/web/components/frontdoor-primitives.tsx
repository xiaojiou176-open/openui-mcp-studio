import { Badge } from "@/components/ui/badge";

type SectionHeaderProps = {
  badge: string;
  title: string;
  body: string;
  id?: string;
};

export function SectionHeader({
  badge,
  title,
  body,
  id,
}: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <Badge variant="outline" className="surface-badge w-fit">
        {badge}
      </Badge>
      <div className="flex flex-col gap-2">
        <h2 id={id} className="text-3xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
          {body}
        </p>
      </div>
    </div>
  );
}

type SurfaceMetaListProps = {
  labels: {
    audience: string;
    bestFor: string;
    readWhen: string;
    notFor: string;
  };
  audience: string;
  bestFor: string;
  readWhen: string;
  notFor: string;
};

export function SurfaceMetaList({
  labels,
  audience,
  bestFor,
  readWhen,
  notFor,
}: SurfaceMetaListProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-border/70 pt-3 text-xs leading-6 text-muted-foreground">
      <p>
        <span className="font-semibold text-foreground">{labels.audience}:</span>{" "}
        {audience}
      </p>
      <p>
        <span className="font-semibold text-foreground">{labels.bestFor}:</span>{" "}
        {bestFor}
      </p>
      <p>
        <span className="font-semibold text-foreground">{labels.readWhen}:</span>{" "}
        {readWhen}
      </p>
      <p>
        <span className="font-semibold text-foreground">{labels.notFor}:</span>{" "}
        {notFor}
      </p>
    </div>
  );
}
