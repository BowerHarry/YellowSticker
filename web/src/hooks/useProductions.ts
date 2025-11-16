import { useEffect, useState } from 'react';
import type { Production } from '../lib/types';
import { getProductions } from '../lib/api';

export const useProductions = () => {
  const [productions, setProductions] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getProductions()
      .then((data) => {
        if (isMounted) {
          setProductions(data);
          setError(null);
        }
      })
      .catch((err) => {
        console.error(err);
        setError('Unable to load productions right now.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { productions, loading, error };
};

