"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type AccordionStep = {
  number: string;
  title: string;
  description: string;
};

export function Accordion({ steps }: { steps: AccordionStep[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col divide-y divide-white/[0.06]">
      {steps.map((step, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={step.number}>
            <button
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex w-full items-center justify-between gap-4 py-4 text-left transition hover:opacity-80"
              aria-expanded={isOpen}
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs text-aurora-green">{step.number}</span>
                <span className="font-heading text-sm font-medium text-foreground">
                  {step.title}
                </span>
              </span>
              <ChevronDown
                size={16}
                className={`shrink-0 text-[#8fb5a8] transition-transform duration-300 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="pb-4 pl-[calc(1.5rem+0.75rem)] pr-6 font-body text-sm text-[#8fb5a8]">
                  {step.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
