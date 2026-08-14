// Jest manual mock: the real expo-secure-store package ships ESM that ts-jest
// cannot parse under the node test environment, and tests only need the
// supabase storage abstraction around it.
export async function getItemAsync(key: string): Promise<string | null> {
  return null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {}

export async function deleteItemAsync(key: string): Promise<void> {}
