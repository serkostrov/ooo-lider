import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/DateField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RegistryJournalField } from "./data";

const NONE = "__none__";

export function RegistryFieldInput({
  field,
  value,
  onChange,
}: {
  field: RegistryJournalField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.field_type === "date") {
    return <DateField value={value} onChange={onChange} clearable className="w-full" />;
  }
  if (field.field_type === "textarea") {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="text-sm"
      />
    );
  }
  if (field.field_type === "select") {
    return (
      <Select
        value={value || NONE}
        onValueChange={(v) => onChange(v === NONE ? "" : v)}
      >
        <SelectTrigger className="h-9 w-full text-sm">
          <SelectValue placeholder="Выберите" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-sm text-muted-foreground">
            Не указано
          </SelectItem>
          {field.options.map((o) => (
            <SelectItem key={o} value={o} className="text-sm">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      type={field.field_type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 text-sm"
    />
  );
}
