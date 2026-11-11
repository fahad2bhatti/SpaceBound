import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/spacebound/Game";

export const Route = createFileRoute("/")({ component: Game });
