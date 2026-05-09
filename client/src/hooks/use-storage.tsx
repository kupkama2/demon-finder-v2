import { useState, useEffect } from "react";

const STORAGE_KEY = "demon-finder-data";

export function useStorage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    // Load data from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setData(JSON.parse(stored));
      } else {
        setData({ visits: [] });
      }
    } catch (error) {
      console.error("Error loading data:", error);
      setData({ visits: [] });
    }
  }, []);

  const saveData = (newData: any) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
      setData(newData);
    } catch (error) {
      console.error("Error saving data:", error);
    }
  };

  return { data, saveData };
}
