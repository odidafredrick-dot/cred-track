import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

type DarajaStkPushInput = {
  phoneNumber: string;
  amount: number;
  apiRef: string;
  narrative: string;
};

export type DarajaStkResponse = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type DarajaCallbackItem = {
  Name?: string;
  Value?: string | number;
};

export type DarajaStkCallback = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: number | string;
  ResultDesc?: string;
  CallbackMetadata?: {
    Item?: DarajaCallbackItem[];
  };
};

function optionalEnv(name: string) {
  return (process.env[name] || "").trim();
}

function requiredEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function isDarajaLive() {
  return optionalEnv("DARAJA_LIVE").toLowerCase() === "true";
}

function getDarajaBaseUrl() {
  const configured = optionalEnv("DARAJA_BASE_URL");
  if (configured) {
    try {
      const parsedUrl = new URL(configured);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      if (baseUrl.includes("safaricom.co.ke")) {
        return baseUrl;
      }
    } catch {
      // Fall through to the sandbox/live default below.
    }
  }

  return isDarajaLive()
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function getDarajaBusinessShortCode() {
  if (!isDarajaLive() && optionalEnv("DARAJA_SHORTCODE")) {
    return optionalEnv("DARAJA_SHORTCODE");
  }

  const shortcode =
    optionalEnv("DARAJA_STORE_NUMBER") ||
    optionalEnv("DARAJA_TILL_NUMBER") ||
    optionalEnv("DARAJA_SHORTCODE");

  if (!shortcode) {
    throw new Error(
      "Missing Daraja shortcode. Set DARAJA_STORE_NUMBER, DARAJA_TILL_NUMBER, or DARAJA_SHORTCODE."
    );
  }

  return shortcode;
}

function getDarajaPartyB() {
  if (!isDarajaLive() && optionalEnv("DARAJA_SHORTCODE")) {
    return optionalEnv("DARAJA_SHORTCODE");
  }

  const partyB =
    optionalEnv("DARAJA_TILL_NUMBER") ||
    optionalEnv("DARAJA_STORE_NUMBER") ||
    optionalEnv("DARAJA_SHORTCODE");

  if (!partyB) {
    throw new Error(
      "Missing Daraja PartyB. Set DARAJA_TILL_NUMBER, DARAJA_STORE_NUMBER, or DARAJA_SHORTCODE."
    );
  }

  return partyB;
}

function getDarajaTransactionType() {
  const configured = optionalEnv("DARAJA_TRANSACTION_TYPE");
  if (
    configured === "CustomerPayBillOnline" ||
    configured === "CustomerBuyGoodsOnline"
  ) {
    return configured;
  }

  if (!isDarajaLive()) {
    return "CustomerPayBillOnline";
  }

  if (optionalEnv("DARAJA_STORE_NUMBER") || optionalEnv("DARAJA_TILL_NUMBER")) {
    return "CustomerBuyGoodsOnline";
  }
  return "CustomerPayBillOnline";
}

function darajaTimestamp(date = new Date()) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    date.getFullYear().toString(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function darajaPassword(timestamp: string) {
  const value =
    getDarajaBusinessShortCode() + requiredEnv("DARAJA_PASSKEY") + timestamp;
  return Buffer.from(value).toString("base64");
}

function accountReference(apiRef: string) {
  const clean = apiRef.replace(/[^a-zA-Z0-9]/g, "");
  return (clean || "HOLWA").slice(0, 20);
}

function callbackUrlWithToken() {
  const callbackUrl = requiredEnv("DARAJA_CALLBACK_URL");
  const token = optionalEnv("MPESA_CALLBACK_TOKEN");

  if (!token) {
    return callbackUrl;
  }

  const url = new URL(callbackUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function normalizeMpesaPhone(phoneNumber: string) {
  let cleanPhone = (phoneNumber || "")
    .replace(/[\s-]/g, "")
    .replace(/^\+/, "")
    .trim();

  if (cleanPhone.startsWith("0")) {
    cleanPhone = `254${cleanPhone.slice(1)}`;
  } else if (/^7\d{8}$/.test(cleanPhone)) {
    cleanPhone = `254${cleanPhone}`;
  }

  if (
    !cleanPhone.startsWith("254") ||
    cleanPhone.length !== 12 ||
    !/^\d+$/.test(cleanPhone)
  ) {
    throw new Error("Phone number must be a valid Kenyan M-Pesa number.");
  }

  return cleanPhone;
}

async function getDarajaAccessToken() {
  const credentials = Buffer.from(
    `${requiredEnv("DARAJA_CONSUMER_KEY")}:${requiredEnv(
      "DARAJA_CONSUMER_SECRET"
    )}`
  ).toString("base64");

  const response = await fetch(
    `${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
    }
  );

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    errorMessage?: string;
  };

  if (!response.ok || !data.access_token) {
    const message =
      data.errorMessage ||
      `Failed to authenticate with Safaricom (${response.status}).`;
    throw new Error(message);
  }

  return data.access_token;
}

export async function createDarajaStkPush({
  phoneNumber,
  amount,
  apiRef,
  narrative,
}: DarajaStkPushInput) {
  const normalizedPhone = normalizeMpesaPhone(phoneNumber);
  const timestamp = darajaTimestamp();
  const accessToken = await getDarajaAccessToken();
  const businessShortCode = getDarajaBusinessShortCode();

  const payload = {
    BusinessShortCode: businessShortCode,
    Password: darajaPassword(timestamp),
    Timestamp: timestamp,
    TransactionType: getDarajaTransactionType(),
    Amount: amount,
    PartyA: normalizedPhone,
    PartyB: getDarajaPartyB(),
    PhoneNumber: normalizedPhone,
    CallBackURL: callbackUrlWithToken(),
    AccountReference: accountReference(apiRef),
    TransactionDesc: narrative.slice(0, 100),
  };

  const response = await fetch(
    `${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = (await response.json().catch(() => ({}))) as DarajaStkResponse;

  if (!response.ok || data.ResponseCode !== "0" || !data.CheckoutRequestID) {
    const message =
      data.errorMessage ||
      data.ResponseDescription ||
      data.CustomerMessage ||
      `M-Pesa request failed (${response.status}).`;

    console.error("[Daraja] STK push error", {
      status: response.status,
      responseCode: data.ResponseCode,
      errorCode: data.errorCode,
      message,
    });

    throw new Error(message);
  }

  return data;
}

export function extractDarajaCallbackMetadata(
  stkCallback: DarajaStkCallback
) {
  const callbackItems = stkCallback.CallbackMetadata?.Item;
  const items = Array.isArray(callbackItems) ? callbackItems : [];
  return items.reduce<Record<string, string | number>>((metadata, item) => {
    if (item.Name) {
      metadata[item.Name] = item.Value ?? "";
    }
    return metadata;
  }, {});
}

export function verifyMpesaCallbackToken(suppliedToken: string | null) {
  const expectedToken = optionalEnv("MPESA_CALLBACK_TOKEN");
  if (!expectedToken) {
    return true;
  }

  const supplied = (suppliedToken || "").trim();
  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(supplied);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
