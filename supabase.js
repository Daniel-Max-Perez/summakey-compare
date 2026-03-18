// --- Supabase Configuration ---
// IMPORTANT: Replace these with your actual Supabase project credentials
const SUPABASE_URL = 'https://rcgmoguprgquqkqftnuy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjZ21vZ3VwcmdxdXFrcWZ0bnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTE5NjUsImV4cCI6MjA4NzEyNzk2NX0.TI_Fi-tw7BUTVQLhwnv8rt1uy-PqO726KgsPTJGyorU';

// Stripe checkout link for SummaKey Compare upgrade
const STRIPE_COMPARE_CHECKOUT_URL = 'https://summakey-backend.vercel.app/api/stripe-checkout';

// Initialize the Supabase client with custom storage for Chrome Extensions
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => {
        return new Promise((resolve) => {
          chrome.storage.local.get([key], (result) => {
            resolve(result[key] || null);
          });
        });
      },
      setItem: (key, value) => {
        return new Promise((resolve) => {
          chrome.storage.local.set({ [key]: value }, resolve);
        });
      },
      removeItem: (key) => {
        return new Promise((resolve) => {
          chrome.storage.local.remove([key], resolve);
        });
      },
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

// --- Session Management Helpers ---

/**
 * Generate a new session token, write it to Supabase profiles, and store locally.
 * Call this on successful authentication.
 * @param {string} userId - The Supabase auth user ID
 * @returns {Promise<string>} The generated session token
 */
async function createSessionToken(userId, email) {
  const newToken = crypto.randomUUID();

  if (!email) {
    // Fallback just in case, but preferred to pass it in
    const { data: { user } } = await supabaseClient.auth.getUser();
    email = user?.email;
  }

  if (!email) {
    console.error('SummaKey Compare: Could not find user email for profile upsert.');
    throw new Error('User email not found');
  }

  // Upsert to Supabase profiles table (ensures row exists and updates it)
  const { error } = await supabaseClient
    .from('profiles')
    .upsert({ 
      id: userId, 
      email: email,
      session_token: newToken
    });

  if (error) {
    console.error('SummaKey Compare: Failed to write session token to Supabase:', error);
    throw error;
  }

  // Store locally
  await chrome.storage.local.set({ sessionToken: newToken });

  console.log('SummaKey Compare: Session token created and stored.');
  return newToken;
}

/**
 * Validate the local session token against Supabase profiles.session_token.
 * @returns {Promise<boolean>} true if tokens match, false otherwise
 */
async function validateSession() {
  console.log('SummaKey Compare: validateSession() starting...');
  try {
    // Get the current user
    console.log('SummaKey Compare: Calling auth.getUser()...');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.warn('SummaKey Compare: No authenticated user found.', userError);
      return false;
    }
    console.log('SummaKey Compare: User found:', user.email);

    // Get the local session token
    const { sessionToken: localToken } = await chrome.storage.local.get('sessionToken');
    if (!localToken) {
      console.warn('SummaKey Compare: No local session token found.');
      return false;
    }

    // Fetch the remote session token from profiles
    console.log('SummaKey Compare: Fetching remote session token...');
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('session_token')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      console.error('SummaKey Compare: Failed to fetch session token from Supabase:', error);
      return false;
    }
    console.log('SummaKey Compare: Remote token fetched.');

    const isValid = data.session_token === localToken;
    if (!isValid) {
      console.warn('SummaKey Compare: Session token mismatch — another device signed in.');
    }
    return isValid;
  } catch (err) {
    console.error('SummaKey Compare: Session validation error:', err);
    return false;
  }
}

/**
 * Force logout: clear all local auth state and sign out of Supabase.
 */
async function forceLogout() {
  console.log('SummaKey Compare: Forcing logout...');
  await supabaseClient.auth.signOut();
  await chrome.storage.local.remove(['sessionToken', 'userEmail', 'supabaseSession']);
  await chrome.storage.sync.set({ pro: false });
  console.log('SummaKey Compare: Logged out and local state cleared.');
}

/**
 * Check if the user has an active Compare purchase.
 * Queries the purchases table for status === 'active' AND product === 'Compare'.
 * @param {string} email - The user's email address
 * @returns {Promise<boolean>} true if active purchase exists
 */
async function checkPurchaseStatus(email) {
  if (!email) return false;

  try {
    const { data, error } = await supabaseClient
      .from('purchases')
      .select('id')
      .eq('email', email)
      .eq('status', 'active')
      .eq('product', 'Compare')
      .limit(1);

    if (error) {
      console.error('SummaKey Compare: Purchase check failed:', error);
      return false;
    }

    return data && data.length > 0;
  } catch (err) {
    console.error('SummaKey Compare: Purchase check error:', err);
    return false;
  }
}

/**
 * Get the currently authenticated user's email, or null if not signed in.
 * @returns {Promise<string|null>}
 */
async function getAuthenticatedEmail() {
  console.log('SummaKey Compare: getAuthenticatedEmail() starting...');
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    console.log('SummaKey Compare: getAuthenticatedEmail() result:', user?.email || 'none');
    return user?.email || null;
  } catch (err) {
    console.error('SummaKey Compare: Error in getAuthenticatedEmail():', err);
    return null;
  }
}
