import { useEffect, useState } from 'react';
import { getComingSoonProductions } from '../lib/api';
export const useComingSoonProductions = () => {
    const [productions, setProductions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        let isMounted = true;
        getComingSoonProductions()
            .then((data) => {
            if (isMounted) {
                setProductions(data);
                setError(null);
            }
        })
            .catch((err) => {
            console.error(err);
            setError('Unable to load coming soon productions right now.');
        })
            .finally(() => {
            if (isMounted)
                setLoading(false);
        });
        return () => {
            isMounted = false;
        };
    }, []);
    return { productions, loading, error };
};
