import { policyDictionary } from "~/privacy/dictionary";
import { CookiePolicy } from "@policystack/react/policy";
import { PolicyPage, policyComponents } from "~/privacy/components.tsrx";
import { StorageInventory } from "~/privacy/inventory.tsrx";

export function Component() @{
  <PolicyPage title="Cookie policy">
    <CookiePolicy components={policyComponents} dictionary={policyDictionary} />
    <StorageInventory />
  </PolicyPage>;
}
