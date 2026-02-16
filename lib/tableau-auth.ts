/**
 * Tableau REST API Authentication using Personal Access Tokens (PAT).
 * Implements sign-in and sign-out without the tableauserverclient library.
 */

interface TableauAuthResponse {
  credentials: {
    site: {
      id: string;
      contentUrl: string;
    };
    user: {
      id: string;
    };
    token: string;
  };
}

export interface TableauAuthCredentials {
  authToken: string;
  siteId: string;
  apiVersion: string;
}

/**
 * Sign in to Tableau Server using a Personal Access Token.
 *
 * @param serverUrl - Tableau Server URL (e.g., "https://us-west-2b.online.tableau.com")
 * @param siteName - Site content URL (use empty string for Default site)
 * @param tokenName - Personal Access Token name
 * @param tokenSecret - Personal Access Token secret
 * @param apiVersion - Optional API version (defaults to "3.24")
 * @returns Auth credentials including token, site ID, and API version
 */
export async function signIn(
  serverUrl: string,
  siteName: string,
  tokenName: string,
  tokenSecret: string,
  apiVersion: string = "3.24",
): Promise<TableauAuthCredentials> {
  const url = `${serverUrl}/api/${apiVersion}/auth/signin`;

  const payload = {
    credentials: {
      personalAccessTokenName: tokenName,
      personalAccessTokenSecret: tokenSecret,
      site: {
        contentUrl: siteName,
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Tableau auth failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as TableauAuthResponse;

  return {
    authToken: data.credentials.token,
    siteId: data.credentials.site.id,
    apiVersion,
  };
}

/**
 * Sign out from Tableau Server (revoke the current auth token).
 *
 * @param serverUrl - Tableau Server URL
 * @param authToken - Active auth token
 * @param apiVersion - API version
 */
export async function signOut(
  serverUrl: string,
  authToken: string,
  apiVersion: string,
): Promise<void> {
  const url = `${serverUrl}/api/${apiVersion}/auth/signout`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "X-Tableau-Auth": authToken,
        "Content-Type": "application/json",
      },
    });
    // Ignore response - sign out is best-effort
  } catch (error) {
    // Suppress sign-out errors
    console.warn("Tableau sign-out error (non-fatal):", error);
  }
}
