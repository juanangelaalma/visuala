"use client";

import { useState } from "react";

const faqs = [
  {
    id: "faq-1",
    question: "Is Visuala free to start?",
    answer:
      "Yes! The Starter plan is completely free, forever. No credit card required. It includes up to 3 projects, 1 editor seat, and access to the community design system.",
  },
  {
    id: "faq-2",
    question: "Can I migrate from Figma?",
    answer:
      "Absolutely. Visuala has a first-class Figma importer that converts your existing files, components, and styles into Visuala's format in minutes. Your design history stays intact.",
  },
  {
    id: "faq-3",
    question: "How does the code export work?",
    answer:
      "Select any frame or component and Visuala generates clean, production-ready code in React + TypeScript, Tailwind CSS, plain CSS, or Vue. The code respects your project's naming conventions and is copy-paste ready.",
  },
  {
    id: "faq-4",
    question: "What does SSO / SAML integration mean for Enterprise?",
    answer:
      "Enterprise customers can configure Single Sign-On via SAML 2.0 or OIDC with any identity provider (Okta, Azure AD, Google Workspace, etc.). This means your team members authenticate through your existing IdP — no separate passwords needed, and access is automatically revoked when you off-board staff.",
  },
  {
    id: "faq-5",
    question: "Is my data secure?",
    answer:
      "Visuala is SOC 2 Type II certified, GDPR-compliant, and uses AES-256 encryption at rest with TLS 1.3 in transit. Enterprise plans also get data residency options (US or EU) and custom data retention policies.",
  },
  {
    id: "faq-6",
    question: "Do you offer a money-back guarantee?",
    answer:
      "Yes. All paid plans come with a 30-day money-back guarantee. If you're not satisfied for any reason in the first 30 days, we'll issue a full refund, no questions asked.",
  },
];

export default function FAQSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="py-24 sm:py-32"
    >
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-400">
            FAQ
          </p>
          <h2
            id="faq-heading"
            className="text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            Frequently asked{" "}
            <span className="gradient-text">questions</span>
          </h2>
        </div>

        {/* Accordion */}
        <dl className="mt-16 space-y-3">
          {faqs.map((faq) => {
            const isOpen = openId === faq.id;
            return (
              <div
                key={faq.id}
                id={faq.id}
                className={`glass-card overflow-hidden rounded-2xl transition-all duration-200 ${
                  isOpen ? "border-brand-500/40" : "hover:border-border-default"
                }`}
              >
                <dt>
                  <button
                    id={`${faq.id}-trigger`}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`${faq.id}-answer`}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-base font-semibold text-text-primary"
                    onClick={() => toggle(faq.id)}
                  >
                    {faq.question}
                    <svg
                      className={`h-5 w-5 shrink-0 text-text-muted transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      />
                    </svg>
                  </button>
                </dt>
                <dd
                  id={`${faq.id}-answer`}
                  role="region"
                  aria-labelledby={`${faq.id}-trigger`}
                  hidden={!isOpen}
                  className="px-6 pb-6 text-sm leading-relaxed text-text-secondary"
                >
                  {faq.answer}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
