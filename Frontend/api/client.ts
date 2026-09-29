import Constants from 'expo-constants';

// HTTP Client for communicating with the backend API
export let API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

if (__DEV__ && API_BASE_URL.includes('localhost') && Constants.expoConfig?.hostUri) {
  const host = Constants.expoConfig.hostUri.split(':')[0];
  API_BASE_URL = `http://${host}:5000`;
}
console.log("DEBUG: API_BASE_URL is resolved to ->", API_BASE_URL);

export interface Course {
  id: number;
  title: string;
  description: string;
  price: number;
  thumbnail: string;
  category: string;
}

export const fetchCourses = async (): Promise<Course[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/courses`);
    if (!response.ok) {
      throw new Error(`Error fetching courses: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return [];
  }
};
