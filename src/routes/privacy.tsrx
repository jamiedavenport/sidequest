import { policyDictionary } from "~/privacy/dictionary";
import { PrivacyPolicy } from "@policystack/react/policy";
import { PolicyPage, policyComponents } from "~/privacy/components.tsrx";

export function Component() @{
  <PolicyPage title="Privacy policy">
    <PrivacyPolicy components={policyComponents} dictionary={policyDictionary} />
  </PolicyPage>;
}
