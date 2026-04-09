import Button from "./Button";

const AuthButtons = () => {
  return (
    <div className="flex items-center gap-4 bg-dark-bg">
      {/* Tombol Utama */}
      <Button>
        Start free trial
      </Button>

      {/* Tombol Secondary/Outline */}
      <Button variant="outline">
        Login
      </Button>
    </div>
  );
};

export default AuthButtons;