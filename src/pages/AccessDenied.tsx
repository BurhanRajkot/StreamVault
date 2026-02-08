
import ErrorLayout from "@/components/ErrorLayout";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AccessDenied = () => {
  const navigate = useNavigate();

  return (
    <ErrorLayout
      code="403"
      title="VIP Access Only"
      description="This area is restricted. You don't have the necessary clearance to view this content."
      imageSrc="/error-images/403.png"
      action={
        <Button
          variant="default"
          size="lg"
          onClick={() => navigate("/login")}
          className="bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/25"
        >
          <Lock className="mr-2 h-4 w-4" />
          Login to Access
        </Button>
      }
    />
  );
};

export default AccessDenied;
