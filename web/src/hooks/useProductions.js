import { useEffect, useState } from 'react';
import { getProductions } from '../lib/api';
export const useProductions = () => {
    const [productions, setProductions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
            if (isMounted)
                setLoading(false);
        });
        return () => {
            isMounted = false;
        };
    }, []);
    return { productions, loading, error };
};
