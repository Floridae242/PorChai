import { Banner } from "@/components/ui/banner";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { InputField } from "@/components/ui/input-field";
import { ListRow } from "@/components/ui/list-row";
import { MASCOT_POSES, Mascot } from "@/components/ui/mascot";

// Dev showcase of every UI primitive in every state.
const VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-body text-lg font-semibold text-primary">{title}</h2>
      {children}
    </section>
  );
}

export const instant = false;

export default function UiDemoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 p-6">
      <h1 className="font-display text-3xl text-primary">UI primitives</h1>

      <Section title="Button">
        {VARIANTS.map((v) => (
          <div key={v} className="flex flex-wrap items-center gap-3">
            <Button variant={v}>{v}</Button>
            <Button variant={v} busy>
              busy
            </Button>
            <Button variant={v} disabled>
              disabled
            </Button>
          </div>
        ))}
        <Button block>block</Button>
      </Section>

      <Section title="InputField">
        <InputField label="Default" placeholder="0" inputMode="decimal" />
        <InputField label="Filled" state="filled" defaultValue="1200" inputMode="decimal" helper="Helper text" />
        <InputField label="Error" state="error" defaultValue="abc" inputMode="decimal" helper="Enter a number" />
      </Section>

      <Section title="Chip">
        <div className="flex gap-2">
          <Chip selected>On</Chip>
          <Chip>Off</Chip>
        </div>
      </Section>

      <Section title="ListRow">
        <ListRow title="Rent" subtitle="Due 5th" amount="8,500" badge="Unpaid" />
        <ListRow title="Coffee" amount="65" />
      </Section>

      <Section title="Banner">
        <Banner kind="info" text="Info message" />
        <Banner kind="warn" text="Warning message" action={{ label: "Details", href: "#" }} />
        <Banner kind="error" text="Error message" />
      </Section>

      <Section title="Mascot">
        <div className="grid grid-cols-4 gap-3">
          {MASCOT_POSES.map((p) => (
            <figure key={p} className="flex flex-col items-center gap-1">
              <Mascot pose={p} size={64} />
              <figcaption className="font-body text-xs text-muted">{p}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="EmptyState">
        <EmptyState title="Nothing here yet" body="Add your first item to get started." action={{ label: "Add" }} />
      </Section>
    </main>
  );
}
