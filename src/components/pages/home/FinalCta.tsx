import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function FinalCta() {
    return (
        <section aria-labelledby="cta-title" className="bg-teal py-14 text-white md:py-20">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center">
                <h2 id="cta-title" className="text-2xl font-extrabold text-white md:text-4xl">
                    Ready to play?
                </h2>
                <p className="max-w-md text-white/90">See which slots are open and lock yours in.</p>
                <Button href="/book" size="lg" variant="light">
                    <CalendarCheck size={18} aria-hidden /> Check availability
                </Button>
            </div>
        </section>
    );
}