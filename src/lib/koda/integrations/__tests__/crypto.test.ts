import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { decryptSecret, encryptSecret, signValue, verifySignedValue } from "../crypto";

describe("token crypto", () => {
  beforeEach(() => {
    process.env.KODA_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips a secret", () => {
    const secret = "ya29.a0AfB_example-token-value";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("produces distinct ciphertexts per call (fresh IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptSecret("secret");
    const [iv, ct, tag] = enc.split(".");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 0xff;
    const tampered = `${iv}.${flipped.toString("base64")}.${tag}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => decryptSecret("not-encrypted")).toThrow();
  });

  it("fails without a key", () => {
    delete process.env.KODA_TOKEN_ENC_KEY;
    expect(() => encryptSecret("x")).toThrow(/KODA_TOKEN_ENC_KEY/);
  });

  it("fails with a wrong-length key", () => {
    process.env.KODA_TOKEN_ENC_KEY = randomBytes(16).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });

  it("cannot decrypt after key rotation", () => {
    const enc = encryptSecret("secret");
    process.env.KODA_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(enc)).toThrow();
  });
});

describe("signed values (OAuth cookies)", () => {
  beforeEach(() => {
    process.env.KODA_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips a signed value", () => {
    const signed = signValue("state-nonce-123");
    expect(verifySignedValue(signed)).toBe("state-nonce-123");
  });

  it("rejects a tampered value", () => {
    const signed = signValue("state-nonce-123");
    expect(verifySignedValue(`evil${signed}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const signed = signValue("state-nonce-123");
    expect(verifySignedValue(signed.slice(0, -2) + "xx")).toBeNull();
  });

  it("rejects unsigned input", () => {
    expect(verifySignedValue("plain")).toBeNull();
  });
});
