import { IMaskInput } from "react-imask";
import { cn } from "@/lib/utils";
import { PHONE_MASK } from "@/lib/validation";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
};

/** Телефон РФ с маской +7 (999) 123-45-67 (react-imask). */
export function PhoneInput({
  value,
  onChange,
  className,
  disabled,
  id,
  placeholder = "+7 (___) ___-__-__",
}: Props) {
  return (
    <IMaskInput
      id={id}
      mask={PHONE_MASK}
      value={value}
      unmask={false}
      disabled={disabled}
      placeholder={placeholder}
      inputMode="tel"
      autoComplete="tel"
      onAccept={(v: string) => onChange(v)}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-base transition-colors",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
    />
  );
}
