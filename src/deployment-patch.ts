import { createHash } from "node:crypto";
export const caddyHandler =
  "\n\t# Social Reading: preserve prefix and overwrite client-supplied proxy identity.\n\tredir /social-reading /social-reading/ 308\n\thandle /social-reading/* {\n\t\treverse_proxy 127.0.0.1:4199 {\n\t\t\theader_up X-Social-Reading-Client-IP {remote_host}\n\t\t}\n\t}\n";
export function patchCaddy(input: string, expected: string) {
  if (
    !/^[a-f0-9]{64}$/.test(expected) ||
    createHash("sha256").update(input).digest("hex") !== expected
  )
    throw Error("Live configuration digest changed; inspect drift first.");
  if (input.includes("/social-reading"))
    throw Error(
      "Existing Social Reading configuration requires review; no duplicate patch.",
    );
  const start = /^libretexts\.dev \{\r?\n\timport secheaders\r?\n/gm;
  if ([...input.matchAll(start)].length !== 1)
    throw Error("Expected exactly one known root-site block.");
  return input.replace(start, (match) => match + caddyHandler);
}

export const libraryApiHandler = `
	# Social Reading: private API only; existing reader assets and headers stay intact.
	handle /social-reading/api/* {
		reverse_proxy 127.0.0.1:4199 {
			header_up X-Social-Reading-Client-IP {remote_host}
		}
	}
`;
export const integratedRootHandler = `
	# Retained entry opens the existing textbook UI.
	@socialReadingEntry path /social-reading /social-reading/*
	redir @socialReadingEntry https://library.libretexts.dev/chem_4b/ 302
`;
export function patchReaderCaddy(input: string, expected: string) {
  if (
    !/^[a-f0-9]{64}$/.test(expected) ||
    createHash("sha256").update(input).digest("hex") !== expected
  )
    throw Error("Live configuration digest changed; inspect drift first.");
  const withoutLegacy = input.replace(caddyHandler, "");
  if (withoutLegacy.includes("/social-reading"))
    throw Error(
      "Existing Social Reading configuration requires review; no duplicate patch.",
    );
  const root = /^libretexts\.dev \{\r?\n/gm;
  const library = /^library\.libretexts\.dev \{\r?\n/gm;
  if (
    [...withoutLegacy.matchAll(root)].length !== 1 ||
    [...withoutLegacy.matchAll(library)].length !== 1
  )
    throw Error("Expected exactly one root and library site block.");
  return withoutLegacy
    .replace(root, (m) => m + integratedRootHandler)
    .replace(library, (m) => m + libraryApiHandler);
}
