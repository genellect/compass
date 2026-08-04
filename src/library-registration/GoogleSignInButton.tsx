"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleCredentialCallback = (response: GoogleCredentialResponse) => void;

type GoogleAccountsId = {
  initialize(options: {
    client_id: string;
    callback(response: GoogleCredentialResponse): void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    hd?: string;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      text: "continue_with";
      shape: "rectangular";
      width: number;
      locale: "ja";
    }
  ): void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

export function createGoogleInitializationOptions(
  clientId: string,
  callback: GoogleCredentialCallback,
  hostedDomain?: string
) {
  return {
    client_id: clientId,
    callback,
    auto_select: false,
    cancel_on_tap_outside: true,
    ...(hostedDomain ? { hd: hostedDomain } : {})
  };
}

export function GoogleSignInButton({
  clientId,
  hostedDomain,
  onCredential,
  onError
}: {
  clientId: string;
  hostedDomain?: string;
  onCredential: (credential: string) => void;
  onError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const credentialHandlerRef = useRef(onCredential);
  const errorHandlerRef = useRef(onError);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    credentialHandlerRef.current = onCredential;
    errorHandlerRef.current = onError;
  }, [onCredential, onError]);

  const renderButton = useCallback(() => {
    if (!scriptReady || !window.google || !containerRef.current) return;
    containerRef.current.replaceChildren();
    window.google.accounts.id.initialize(
      createGoogleInitializationOptions(
        clientId,
        (response) => {
          if (response.credential) {
            credentialHandlerRef.current(response.credential);
          } else {
            errorHandlerRef.current();
          }
        },
        hostedDomain
      )
    );
    window.google.accounts.id.renderButton(containerRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: 280,
      locale: "ja"
    });
  }, [clientId, hostedDomain, scriptReady]);

  useEffect(() => {
    renderButton();
  }, [renderButton]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => errorHandlerRef.current()}
      />
      <div
        className="google-sign-in-container"
        ref={containerRef}
        aria-label="Googleアカウントで続行"
      />
    </>
  );
}
