"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";

export function FaqList({ items, animateQuestions = false }: {
  items: ReadonlyArray<readonly [string, string]>;
  animateQuestions?: boolean;
}) {
  return <Accordion type="single" collapsible className="faq">{items.map(([question, answer], index) =>
    <AccordionItem key={question} value={question}>
      <AccordionTrigger>{animateQuestions ? <TextGenerateEffect as="span" words={question} duration={0.2} delay={index * 0.02} /> : question}</AccordionTrigger>
      <AccordionContent><p>{answer}</p></AccordionContent>
    </AccordionItem>
  )}</Accordion>;
}
