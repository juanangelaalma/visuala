import { OutlineButton } from "./OutlineButton";
import StartFreeTrialButton from "./StartFreeTrialButton";

export default function AuthButtons() {
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <StartFreeTrialButton />
      <OutlineButton>Login</OutlineButton>
    </div>
  );
}
