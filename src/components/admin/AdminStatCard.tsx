import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card.tsx";

interface AdminStatCardProps {
  label: string;
  value: number | string;
  sublabel?: string;
  icon?: ReactNode;
}

export function AdminStatCard({ label, value, sublabel, icon }: AdminStatCardProps) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        {icon}
        {label}
      </div>
      <span className="text-2xl font-semibold text-text-primary">{value}</span>
      {sublabel && <span className="text-xs text-text-secondary">{sublabel}</span>}
    </Card>
  );
}
