import { useId, type InputHTMLAttributes } from "react";

export type InputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size"> & {
  label: string;
  helper?: string;
  state?: "default" | "filled" | "error";
};

export function InputField({ label, helper, state = "default", id, ...rest }: InputFieldProps) {
  const auto = useId();
  const inputId = id ?? `${auto}-input`;
  const helperId = `${auto}-helper`;
  const error = state === "error";
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-body text-sm text-secondary">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error || undefined}
        aria-describedby={helper ? helperId : undefined}
        className={`h-12 rounded-md border bg-subtle px-4 font-body text-base text-primary outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-[var(--green-700)] ${
          error ? "border-danger" : "border-transparent"
        }`}
      />
      {helper ? (
        <p id={helperId} className={`font-body text-xs ${error ? "text-danger" : "text-secondary"}`}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}
