import { Button, type ButtonProps } from "./button";
import { Mascot, type MascotPose } from "./mascot";

export type EmptyStateProps = {
  title: string;
  body?: string;
  action?: { label: string; onClick?: () => void; variant?: ButtonProps["variant"] };
  mascotPose?: MascotPose;
};

export function EmptyState({ title, body, action, mascotPose = "greeting" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center font-body">
      <Mascot pose={mascotPose} size={80} />
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      {body ? <p className="text-sm text-secondary">{body}</p> : null}
      {action ? (
        <Button variant={action.variant ?? "primary"} onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
