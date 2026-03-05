
import ErrorLayout from "@/components/ErrorLayout";
import { PageMeta } from "@/seo/PageMeta";

const ServerError = () => {
  return (
    <>
      <PageMeta title="500 — Server Error" noindex />
      <ErrorLayout
        code="500"
        title="Projector Malfunction"
        description="Our system encountered a critical error. We've dispatched a technician to fix the glitch."
        imageSrc="/error-images/500.png"
        showRetry={true}
      />
    </>
  );
};

export default ServerError;
