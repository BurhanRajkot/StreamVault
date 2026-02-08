import ErrorLayout from "@/components/ErrorLayout";

const NotFound = () => {
  return (
    <ErrorLayout
      code="404"
      title="The Missing Reel"
      description="It seems this scene didn't make the final cut. The page you are looking for has been lost in the digital void."
      imageSrc="/error-images/404.png"
    />
  );
};

export default NotFound;
