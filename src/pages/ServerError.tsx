
import ErrorLayout from "@/components/ErrorLayout";

const ServerError = () => {
  return (
    <ErrorLayout
      code="500"
      title="Projector Malfunction"
      description="Our system encountered a critical error. We've dispatched a technician to fix the glitch."
      imageSrc="/error-images/500.png"
      showRetry={true}
    />
  );
};

export default ServerError;
