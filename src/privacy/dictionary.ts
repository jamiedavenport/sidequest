import { createT } from "@policystack/core";

const english = createT("en");

// V1's default fallback asserts a DPO exemption even when none was declared.
// Do not turn unverified organisational facts into published assertions.
export const policyDictionary = {
  ...english,
  privacy: {
    ...english.privacy,
    dpo: {
      ...english.privacy.dpo,
      absentFallback: () =>
        "For questions about how we handle your personal data or to exercise your privacy rights, contact x@jxd.dev.",
    },
    gdprSupplement: {
      ...english.privacy.gdprSupplement,
      transferBody: {
        prefix: () =>
          "Our providers may process personal data outside the EEA. Transfers require an applicable legal basis and safeguards. The European Commission publishes its ",
        adequacyLinkText: () => "adequacy decisions",
        middle: () =>
          ". Contact us for details of the processing locations and safeguards applicable to your data, including how to obtain copies, at ",
        email: ({ contactEmail }: { contactEmail: string }) => `${contactEmail}.`,
      },
    },
    ukGdprSupplement: {
      ...english.privacy.ukGdprSupplement,
      transferBody: () =>
        "Our providers may process personal data outside the UK. Contact x@jxd.dev for details of the processing locations and safeguards applicable to your data, including how to obtain copies.",
    },
  },
};
