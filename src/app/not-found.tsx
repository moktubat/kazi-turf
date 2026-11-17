import { Button } from "@/components/ui/Button";

export default function NotFound() {
    return (
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
            <p className="font-heading text-6xl font-extrabold text-teal">404</p>
            <h1 className="mt-4 font-heading text-2xl font-bold text-evergreen">
                Page not found
            </h1>
            <p className="mt-2 text-sm text-evergreen/70">
                The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
            <Button href="/" className="mt-6 px-6">
                Back to Home
            </Button>
        </div>
    );
}
