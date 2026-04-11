import Button from "./Button";
import { OutlineButton } from "./OutlineButton";
import StartFreeTrialButton from "./StartFreeTrialButton";

const AuthButtons = () => {
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {/* Tombol Utama */}
      <StartFreeTrialButton />

      {/* Tombol Secondary/Outline */}
      <OutlineButton>Login</OutlineButton>
    </div>
  );
};

export default AuthButtons;