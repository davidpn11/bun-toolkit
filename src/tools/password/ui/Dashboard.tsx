import type { ToolScreenProps } from "../../../cli/define.ts";
import { Screen, type ScreenEntry, type SelectItem, SelectList, useNavigation } from "../../../tui/index.ts";
import { hashScreen } from "./HashStep.tsx";
import { inspectScreen } from "./InspectStep.tsx";
import { verifyScreen } from "./VerifyStep.tsx";

export default function PasswordDashboard({ ctx }: ToolScreenProps) {
  const nav = useNavigation();
  const items: SelectItem<ScreenEntry>[] = [
    { value: hashScreen(ctx), label: "Hash a password", description: "Type it hidden, get a hash to store" },
    {
      value: verifyScreen(ctx),
      label: "Check a password",
      description: "Paste a stored hash, then type the password",
    },
    {
      value: inspectScreen(ctx),
      label: "Inspect a hash",
      description: "Algorithm, cost, and whether it needs a rehash",
    },
  ];
  return (
    <Screen
      subtitle="Hash and check passwords with argon2 or bcrypt"
      hints={[{ key: "enter", label: "open" }]}
    >
      <SelectList items={items} onSelect={(item) => nav.push(item.value)} />
    </Screen>
  );
}
