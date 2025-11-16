import { useEffect, useState } from 'react';
import { getProductionBySlug } from '../lib/api';
export const useProduction = (slug) => {
    const [production, setProduction] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!slug)
            return;
        let isMounted = true;
        setLoading(true);
        getProductionBySlug(slug)
            .then((data) => {
            if (!isMounted)
                return;
            if (!data) {
                setError('Production not found');
                setProduction(null);
                return;
            }
            setProduction(data);
            setError(null);
        })
            .catch((err) => {
            console.error(err);
            setError('Unable to load production');
        })
            .finally(() => {
            if (isMounted)
                setLoading(false);
        });
        return () => {
            isMounted = false;
        };
    }, [slug]);
    return { production, loading, error };
};
